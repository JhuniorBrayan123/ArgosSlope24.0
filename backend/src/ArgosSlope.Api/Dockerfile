# ─────────────────────────────────────────────────────────────────────────────
# ARGOS SLOPE 4.0 — .NET Backend Container
#
# Multi-stage build: SDK → publish → runtime
#
# Build:
#   docker build -t argos-backend-dotnet:latest -f backend/src/ArgosSlope.Api/Dockerfile .
#
# Run:
#   docker run --rm -it -p 8000:8080 --network host argos-backend-dotnet:latest
#
# Environment:
#   DATABASE_URL=Host=postgres;Database=mineriadb;Username=postgres;Password=postgres
#   MQTT_BROKER=localhost
#   MQTT_PORT=1883
#   CORS_ORIGINS=http://localhost:3000
# ─────────────────────────────────────────────────────────────────────────────

FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

# Copy csproj and restore dependencies (layer caching)
COPY backend/src/ArgosSlope.Api/ArgosSlope.Api.csproj ./ArgosSlope.Api/
RUN dotnet restore ./ArgosSlope.Api/ArgosSlope.Api.csproj

# Copy all source and build
COPY backend/ .
WORKDIR /src/ArgosSlope.Api
RUN dotnet publish -c Release -o /app --no-restore

# ── Runtime image ────────────────────────────────────────────────────
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app
COPY --from=build /app .

ENV ASPNETCORE_URLS=http://+:8080
ENV ASPNETCORE_ENVIRONMENT=Production

EXPOSE 8080

ENTRYPOINT ["dotnet", "ArgosSlope.Api.dll"]
