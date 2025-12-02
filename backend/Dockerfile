FROM golang:1.21-alpine AS builder

WORKDIR /app

RUN apk add --no-cache gcc musl-dev

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o lattice-server ./cmd/server

FROM alpine:3.19

WORKDIR /app

RUN apk --no-cache add ca-certificates tzdata

RUN addgroup -g 1001 -S lattice && \
    adduser -u 1001 -S lattice -G lattice

RUN mkdir -p /app/data && chown -R lattice:lattice /app

COPY --from=builder /app/lattice-server .

USER lattice

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

ENV PORT=8080
ENV LATTICE_DB_PATH=/app/data/lattice.db

CMD ["./lattice-server"]

