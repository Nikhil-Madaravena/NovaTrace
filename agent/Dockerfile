FROM golang:1.21-alpine

WORKDIR /app

COPY go.mod ./
COPY *.go ./

RUN go mod tidy
RUN go build -o /agent

CMD [ "/agent" ]
