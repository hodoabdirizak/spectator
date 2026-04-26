# =============================================================
# Multi-stage build for the Spectator Go server
# =============================================================
# Stage 1 (builder): compiles a static binary with CGO disabled
# so the final image can be distroless (no libc). This keeps the
# image under ~25MB and reduces the attack surface.
#
# Stage 2 (runtime): distroless/static — no shell, no package
# manager, just the binary. Safer default for public deployments
# than a full Debian base.
# =============================================================

# ---- builder ---------------------------------------------------
FROM golang:1.22-alpine AS builder
WORKDIR /src

# Cache deps separately so iterating on source doesn't re-download
# the module graph every time.
COPY go.mod go.sum ./
RUN go mod download

COPY . .

# -ldflags "-s -w" strips the symbol table and DWARF info, which
# typically cuts another ~30% off the binary size.
# CGO_DISABLED lets us target distroless/static.
ENV CGO_ENABLED=0 GOOS=linux
RUN go build -ldflags="-s -w" -o /out/spectator-server .

# ---- runtime ---------------------------------------------------
FROM gcr.io/distroless/static-debian12:nonroot
WORKDIR /app
COPY --from=builder /out/spectator-server /app/spectator-server

EXPOSE 8080
USER nonroot:nonroot
ENTRYPOINT ["/app/spectator-server"]
