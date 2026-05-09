FROM golang:1.21-alpine

WORKDIR /app

COPY go.mod ./
COPY *.go ./

RUN go mod tidy
RUN go build -o /backend

EXPOSE 8080

CMD [ "/backend" ]
