FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY ["Landgrab.Api.csproj", "."]
RUN dotnet restore
COPY . .
RUN dotnet publish -c Release -o /app/publish

FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app
# .NET 8 runtime images include a non-root app user by default.
COPY --from=build --chown=app:app /app/publish .
EXPOSE 8080
ENV ASPNETCORE_URLS=http://+:8080

USER app
ENTRYPOINT ["dotnet", "Landgrab.Api.dll"]
