package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/go-redis/redis/v8"
	"github.com/golang-jwt/jwt/v5"
	"github.com/gorilla/websocket"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

// ── Models ──────────────────────────────────────────────────────────────────

type User struct {
	ID           uint   `gorm:"primaryKey"`
	Email        string `gorm:"uniqueIndex" json:"email"`
	PasswordHash string `json:"-"`
	Role         string `json:"role" gorm:"default:viewer"`
	CreatedAt    time.Time
}

type Metric struct {
	ID        uint      `gorm:"primaryKey"`
	NodeID    string    `json:"node_id" gorm:"index"`
	CPUUsage  float64   `json:"cpu_usage"`
	MemUsage  float64   `json:"mem_usage"`
	DiskUsage float64   `json:"disk_usage"`
	Timestamp time.Time `json:"timestamp" gorm:"index"`
}

type ProcessInfo struct {
	PID     int32   `json:"pid"`
	Name    string  `json:"name"`
	CPU     float64 `json:"cpu"`
	Memory  float64 `json:"memory"`
}

type ProcessMetric struct {
	ID        uint          `gorm:"primaryKey"`
	NodeID    string        `json:"node_id" gorm:"index"`
	Processes []ProcessInfo `json:"processes" gorm:"serializer:json"`
	Timestamp time.Time     `json:"timestamp"`
}

type AlertRule struct {
	ID        uint    `gorm:"primaryKey" json:"id"`
	Name      string  `json:"name"`
	Metric    string  `json:"metric"` // cpu | mem | disk
	Threshold float64 `json:"threshold"`
	Duration  int     `json:"duration"` // seconds
	Enabled   bool    `json:"enabled" gorm:"default:true"`
	Webhook   string  `json:"webhook"`
}

type AlertEvent struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	RuleID    uint      `json:"rule_id"`
	NodeID    string    `json:"node_id"`
	Value     float64   `json:"value"`
	Message   string    `json:"message"`
	Severity  string    `json:"severity"` // critical | warning | info
	Resolved  bool      `json:"resolved" gorm:"default:false"`
	CreatedAt time.Time `json:"created_at"`
}

// ── Globals ──────────────────────────────────────────────────────────────────

var (
	ctx      = context.Background()
	rdb      *redis.Client
	db       *gorm.DB
	jwtKey   = []byte(getEnv("JWT_SECRET", "nexus-super-secret-key-change-in-prod"))

	upgrader = websocket.Upgrader{CheckOrigin: func(r *http.Request) bool { return true }}
	clients  = make(map[*websocket.Conn]bool)
	clientMu sync.Mutex

	// Simple in-memory CPU tracking for alert evaluation
	nodeCPUHistory = make(map[string][]float64)
	nodeHistoryMu  sync.Mutex
)

func getEnv(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

// ── Main ─────────────────────────────────────────────────────────────────────

func main() {
	rdb = redis.NewClient(&redis.Options{Addr: getEnv("REDIS_ADDR", "localhost:6379")})

	var err error
	db, err = gorm.Open(postgres.Open(getEnv("POSTGRES_DSN",
		"host=localhost user=postgres password=postgres dbname=tracker port=5432 sslmode=disable")),
		&gorm.Config{})
	if err != nil {
		log.Printf("DB connect error: %v", err)
	} else {
		db.AutoMigrate(&User{}, &Metric{}, &ProcessMetric{}, &AlertRule{}, &AlertEvent{})
		seedDefaultRules()
		seedDefaultUsers()
	}

	go subscribeToMetrics()

	r := gin.Default()
	r.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"*"},
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
	}))

	// Public routes
	r.POST("/api/auth/register", registerHandler)
	r.POST("/api/auth/login", loginHandler)
	r.POST("/api/collect", collectMetrics)          // agent endpoint (use API key in prod)
	r.POST("/api/collect/processes", collectProcesses)
	r.GET("/ws", handleWebSocket)

	// Protected routes
	auth := r.Group("/api")
	auth.Use(jwtMiddleware())
	{
		auth.GET("/metrics", getHistoricalMetrics)
		auth.GET("/nodes", getNodes)
		auth.GET("/processes/:node", getProcesses)
		auth.GET("/alerts", getAlerts)
		auth.GET("/alerts/rules", getAlertRules)
		auth.POST("/alerts/rules", createAlertRule)
		auth.PUT("/alerts/rules/:id", updateAlertRule)
		auth.DELETE("/alerts/rules/:id", deleteAlertRule)
		auth.POST("/alerts/:id/resolve", resolveAlert)
		auth.GET("/me", meHandler)
	}

	// System info endpoint (public for demo)
	r.GET("/api/sysinfo", sysInfoHandler)

	port := getEnv("PORT", "8080")
	log.Printf("NovaTrace backend starting on :%s", port)
	r.Run(":" + port)
}

// ── Auth ──────────────────────────────────────────────────────────────────────

type Claims struct {
	UserID uint   `json:"user_id"`
	Email  string `json:"email"`
	Role   string `json:"role"`
	jwt.RegisteredClaims
}

func jwtMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		tokenStr := ""
		auth := c.GetHeader("Authorization")
		if len(auth) > 7 && auth[:7] == "Bearer " {
			tokenStr = auth[7:]
		}
		if tokenStr == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			c.Abort()
			return
		}
		claims := &Claims{}
		token, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (interface{}, error) {
			return jwtKey, nil
		})
		if err != nil || !token.Valid {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
			c.Abort()
			return
		}
		c.Set("user_id", claims.UserID)
		c.Set("email", claims.Email)
		c.Set("role", claims.Role)
		c.Next()
	}
}

func registerHandler(c *gin.Context) {
	var body struct {
		Email    string `json:"email" binding:"required,email"`
		Password string `json:"password" binding:"required,min=6"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	hash, _ := bcrypt.GenerateFromPassword([]byte(body.Password), 12)
	user := User{Email: body.Email, PasswordHash: string(hash), Role: "admin"}
	if err := db.Create(&user).Error; err != nil {
		c.JSON(http.StatusConflict, gin.H{"error": "email already registered"})
		return
	}
	token := generateToken(user)
	c.JSON(http.StatusCreated, gin.H{"token": token, "user": user})
}

func loginHandler(c *gin.Context) {
	var body struct {
		Email    string `json:"email" binding:"required"`
		Password string `json:"password" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	var user User
	if err := db.Where("email = ?", body.Email).First(&user).Error; err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
		return
	}
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(body.Password)); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
		return
	}
	token := generateToken(user)
	c.JSON(http.StatusOK, gin.H{"token": token, "user": user})
}

func generateToken(u User) string {
	claims := &Claims{
		UserID: u.ID,
		Email:  u.Email,
		Role:   u.Role,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(72 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	t, _ := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(jwtKey)
	return t
}

func meHandler(c *gin.Context) {
	email, _ := c.Get("email")
	role, _ := c.Get("role")
	c.JSON(http.StatusOK, gin.H{"email": email, "role": role})
}

func sysInfoHandler(c *gin.Context) {
	var nodeCount int64
	var alertCount int64
	var metricCount int64
	if db != nil {
		db.Model(&Metric{}).Distinct("node_id").Count(&nodeCount)
		db.Model(&AlertEvent{}).Where("resolved = false").Count(&alertCount)
		db.Model(&Metric{}).Count(&metricCount)
	}
	c.JSON(http.StatusOK, gin.H{
		"project":       "NovaTrace",
		"version":       "2.0.0",
		"nodes":         nodeCount,
		"active_alerts": alertCount,
		"metrics_stored": metricCount,
		"uptime":        time.Since(startTime).String(),
	})
}

var startTime = time.Now()

func seedDefaultUsers() {
	// Seed a default admin and a read-only viewer if they don't exist
	defaults := []struct {
		Email    string
		Password string
		Role     string
	}{
		{"admin@novatrace.io", "admin123", "admin"},
		{"viewer@novatrace.io", "viewer123", "viewer"},
	}
	for _, d := range defaults {
		var existing User
		if db.Where("email = ?", d.Email).First(&existing).Error == nil {
			continue // already exists
		}
		hash, _ := bcrypt.GenerateFromPassword([]byte(d.Password), 12)
		db.Create(&User{Email: d.Email, PasswordHash: string(hash), Role: d.Role})
		log.Printf("Seeded user: %s (role: %s)", d.Email, d.Role)
	}
}

// ── Metrics ───────────────────────────────────────────────────────────────────

type MetricPayload struct {
	NodeID    string    `json:"node_id"`
	CPUUsage  float64   `json:"cpu_usage"`
	MemUsage  float64   `json:"mem_usage"`
	DiskUsage float64   `json:"disk_usage"`
	Timestamp time.Time `json:"timestamp"`
}

func collectMetrics(c *gin.Context) {
	var p MetricPayload
	if err := c.ShouldBindJSON(&p); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if p.Timestamp.IsZero() {
		p.Timestamp = time.Now()
	}
	m := Metric{NodeID: p.NodeID, CPUUsage: p.CPUUsage, MemUsage: p.MemUsage, DiskUsage: p.DiskUsage, Timestamp: p.Timestamp}
	if db != nil {
		db.Create(&m)
	}
	payload, _ := json.Marshal(p)
	rdb.Publish(ctx, "metrics_channel", payload)

	// Evaluate alert rules
	go evaluateAlerts(p)

	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

func getHistoricalMetrics(c *gin.Context) {
	if db == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "db unavailable"})
		return
	}
	nodeID := c.Query("node")
	from := c.Query("from")
	to := c.Query("to")
	limit := 500

	query := db.Order("timestamp asc").Limit(limit)
	if nodeID != "" {
		query = query.Where("node_id = ?", nodeID)
	}
	if from != "" {
		if t, err := time.Parse(time.RFC3339, from); err == nil {
			query = query.Where("timestamp >= ?", t)
		}
	}
	if to != "" {
		if t, err := time.Parse(time.RFC3339, to); err == nil {
			query = query.Where("timestamp <= ?", t)
		}
	}
	var metrics []Metric
	query.Find(&metrics)
	c.JSON(http.StatusOK, metrics)
}

func getNodes(c *gin.Context) {
	if db == nil {
		c.JSON(http.StatusOK, []string{})
		return
	}
	var nodes []string
	db.Model(&Metric{}).Distinct("node_id").Pluck("node_id", &nodes)
	c.JSON(http.StatusOK, nodes)
}

// ── Processes ─────────────────────────────────────────────────────────────────

type ProcessPayload struct {
	NodeID    string        `json:"node_id"`
	Processes []ProcessInfo `json:"processes"`
}

func collectProcesses(c *gin.Context) {
	var p ProcessPayload
	if err := c.ShouldBindJSON(&p); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if db != nil {
		pm := ProcessMetric{NodeID: p.NodeID, Processes: p.Processes, Timestamp: time.Now()}
		db.Create(&pm)
	}
	payload, _ := json.Marshal(map[string]interface{}{"type": "processes", "data": p})
	rdb.Publish(ctx, "metrics_channel", payload)
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

func getProcesses(c *gin.Context) {
	nodeID := c.Param("node")
	var pm ProcessMetric
	if err := db.Where("node_id = ?", nodeID).Order("timestamp desc").First(&pm).Error; err != nil {
		c.JSON(http.StatusOK, []ProcessInfo{})
		return
	}
	c.JSON(http.StatusOK, pm.Processes)
}

// ── Alerts ────────────────────────────────────────────────────────────────────

func seedDefaultRules() {
	var count int64
	db.Model(&AlertRule{}).Count(&count)
	if count > 0 {
		return
	}
	rules := []AlertRule{
		{Name: "High CPU", Metric: "cpu", Threshold: 90, Duration: 30, Enabled: true},
		{Name: "High Memory", Metric: "mem", Threshold: 85, Duration: 30, Enabled: true},
		{Name: "Disk Critical", Metric: "disk", Threshold: 95, Duration: 60, Enabled: true},
		{Name: "CPU Warning", Metric: "cpu", Threshold: 75, Duration: 60, Enabled: true},
		{Name: "Memory Warning", Metric: "mem", Threshold: 70, Duration: 60, Enabled: true},
	}
	db.Create(&rules)
	log.Println("Seeded default alert rules")
}

func evaluateAlerts(m MetricPayload) {
	if db == nil {
		return
	}
	var rules []AlertRule
	db.Where("enabled = true").Find(&rules)

	for _, rule := range rules {
		var val float64
		switch rule.Metric {
		case "cpu":
			val = m.CPUUsage
		case "mem":
			val = m.MemUsage
		case "disk":
			val = m.DiskUsage
		}
		if val >= rule.Threshold {
			// Only create one alert per rule+node if not already open
			var existing AlertEvent
			err := db.Where("rule_id = ? AND node_id = ? AND resolved = false", rule.ID, m.NodeID).First(&existing).Error
			if err != nil {
				severity := "warning"
				if val >= rule.Threshold+5 {
					severity = "critical"
				}
				event := AlertEvent{
					RuleID:   rule.ID,
					NodeID:   m.NodeID,
					Value:    val,
					Message:  rule.Name + " on " + m.NodeID + ": " + rule.Metric + " at " + formatFloat(val) + "%",
					Severity: severity,
				}
				db.Create(&event)
				broadcastToClients(mustMarshal(map[string]interface{}{"type": "alert", "data": event}))
				if rule.Webhook != "" {
					go sendDiscordWebhook(rule.Webhook, event.Message, severity)
				}
			}
		} else {
			// Auto-resolve when value drops below threshold
			db.Model(&AlertEvent{}).
				Where("rule_id = ? AND node_id = ? AND resolved = false", rule.ID, m.NodeID).
				Update("resolved", true)
		}
	}
}

func getAlerts(c *gin.Context) {
	if db == nil {
		c.JSON(http.StatusOK, []AlertEvent{})
		return
	}
	var alerts []AlertEvent
	db.Order("created_at desc").Limit(100).Find(&alerts)
	c.JSON(http.StatusOK, alerts)
}

func getAlertRules(c *gin.Context) {
	var rules []AlertRule
	db.Find(&rules)
	c.JSON(http.StatusOK, rules)
}

func createAlertRule(c *gin.Context) {
	var rule AlertRule
	if err := c.ShouldBindJSON(&rule); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	db.Create(&rule)
	c.JSON(http.StatusCreated, rule)
}

func updateAlertRule(c *gin.Context) {
	var rule AlertRule
	if err := db.First(&rule, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	if err := c.ShouldBindJSON(&rule); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	db.Save(&rule)
	c.JSON(http.StatusOK, rule)
}

func deleteAlertRule(c *gin.Context) {
	db.Delete(&AlertRule{}, c.Param("id"))
	c.JSON(http.StatusOK, gin.H{"status": "deleted"})
}

func resolveAlert(c *gin.Context) {
	db.Model(&AlertEvent{}).Where("id = ?", c.Param("id")).Update("resolved", true)
	c.JSON(http.StatusOK, gin.H{"status": "resolved"})
}

// ── WebSocket ─────────────────────────────────────────────────────────────────

func subscribeToMetrics() {
	pubsub := rdb.Subscribe(ctx, "metrics_channel")
	defer pubsub.Close()
	for msg := range pubsub.Channel() {
		broadcastToClients([]byte(msg.Payload))
	}
}

func handleWebSocket(c *gin.Context) {
	ws, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}
	defer ws.Close()
	clientMu.Lock()
	clients[ws] = true
	clientMu.Unlock()
	for {
		if _, _, err := ws.ReadMessage(); err != nil {
			clientMu.Lock()
			delete(clients, ws)
			clientMu.Unlock()
			break
		}
	}
}

func broadcastToClients(msg []byte) {
	clientMu.Lock()
	defer clientMu.Unlock()
	for ws := range clients {
		if err := ws.WriteMessage(websocket.TextMessage, msg); err != nil {
			ws.Close()
			delete(clients, ws)
		}
	}
}

// ── Helpers ───────────────────────────────────────────────────────────────────

func mustMarshal(v interface{}) []byte {
	b, _ := json.Marshal(v)
	return b
}

func formatFloat(f float64) string {
	return fmt.Sprintf("%.1f", f)
}

func sendDiscordWebhook(url, message, severity string) {
	emoji := "⚠️"
	if severity == "critical" {
		emoji = "🚨"
	}
	body, _ := json.Marshal(map[string]string{
		"content": emoji + " **Nexus Monitor Alert** — " + message,
	})
	resp, err := http.Post(url, "application/json", bytes.NewBuffer(body))
	if err != nil {
		log.Printf("Webhook error: %v", err)
		return
	}
	resp.Body.Close()
}
