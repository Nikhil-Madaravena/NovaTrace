package main

import (
	"bytes"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"sort"
	"time"

	"github.com/shirou/gopsutil/v3/cpu"
	"github.com/shirou/gopsutil/v3/disk"
	"github.com/shirou/gopsutil/v3/mem"
	"github.com/shirou/gopsutil/v3/process"
)

type ProcessInfo struct {
	PID    int32   `json:"pid"`
	Name   string  `json:"name"`
	CPU    float64 `json:"cpu"`
	Memory float64 `json:"memory"`
}

type MetricPayload struct {
	NodeID    string    `json:"node_id"`
	CPUUsage  float64   `json:"cpu_usage"`
	MemUsage  float64   `json:"mem_usage"`
	DiskUsage float64   `json:"disk_usage"`
	Timestamp time.Time `json:"timestamp"`
}

type ProcessPayload struct {
	NodeID    string        `json:"node_id"`
	Processes []ProcessInfo `json:"processes"`
}

func post(url string, body interface{}) {
	data, _ := json.Marshal(body)
	resp, err := http.Post(url, "application/json", bytes.NewBuffer(data))
	if err != nil {
		log.Printf("POST %s error: %v", url, err)
		return
	}
	resp.Body.Close()
}

func collectProcessList() []ProcessInfo {
	procs, err := process.Processes()
	if err != nil {
		return nil
	}
	var list []ProcessInfo
	for _, p := range procs {
		name, _ := p.Name()
		cpuPct, _ := p.CPUPercent()
		memInfo, _ := p.MemoryInfo()
		memMB := 0.0
		if memInfo != nil {
			memMB = float64(memInfo.RSS) / 1024 / 1024
		}
		list = append(list, ProcessInfo{PID: p.Pid, Name: name, CPU: cpuPct, Memory: memMB})
	}
	// Sort by CPU descending, take top 15
	sort.Slice(list, func(i, j int) bool { return list[i].CPU > list[j].CPU })
	if len(list) > 15 {
		list = list[:15]
	}
	return list
}

func main() {
	backendURL := os.Getenv("BACKEND_URL")
	if backendURL == "" {
		backendURL = "http://localhost:8080"
	}
	metricsURL := backendURL + "/api/collect"
	processURL := backendURL + "/api/collect/processes"

	nodeID, _ := os.Hostname()
	if nodeID == "" {
		nodeID = "unknown-node"
	}

	log.Printf("Nexus Agent starting on node: %s", nodeID)

	processTicker := time.NewTicker(10 * time.Second)
	metricTicker := time.NewTicker(2 * time.Second)

	for {
		select {
		case <-metricTicker.C:
			cpuPcts, _ := cpu.Percent(0, false)
			cpuVal := 0.0
			if len(cpuPcts) > 0 {
				cpuVal = cpuPcts[0]
			}
			vmem, _ := mem.VirtualMemory()
			memVal := 0.0
			if vmem != nil {
				memVal = vmem.UsedPercent
			}
			dsk, _ := disk.Usage("/")
			diskVal := 0.0
			if dsk != nil {
				diskVal = dsk.UsedPercent
			}
			post(metricsURL, MetricPayload{
				NodeID:    nodeID,
				CPUUsage:  cpuVal,
				MemUsage:  memVal,
				DiskUsage: diskVal,
				Timestamp: time.Now(),
			})
			log.Printf("Metrics → CPU:%.1f%% MEM:%.1f%% DISK:%.1f%%", cpuVal, memVal, diskVal)

		case <-processTicker.C:
			procs := collectProcessList()
			post(processURL, ProcessPayload{NodeID: nodeID, Processes: procs})
			log.Printf("Processes → sent %d entries", len(procs))
		}
	}
}
