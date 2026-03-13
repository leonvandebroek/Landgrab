@description('Base name for all resources')
param appName string = 'landgrab-prod'

@description('Azure region')
param location string = resourceGroup().location

@description('PostgreSQL admin username')
param postgresAdminUser string = 'pgadmin'

@secure()
@description('PostgreSQL admin password')
param postgresAdminPassword string

@secure()
@description('JWT signing secret (min 32 chars)')
param jwtSecret string

// ── App Service Plan (Linux B1) ──
resource appServicePlan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: 'plan-${appName}'
  location: location
  kind: 'linux'
  sku: {
    name: 'B1'
    tier: 'Basic'
  }
  properties: {
    reserved: true // Required for Linux
  }
}

// ── App Service ──
resource appService 'Microsoft.Web/sites@2023-12-01' = {
  name: 'app-${appName}'
  location: location
  properties: {
    serverFarmId: appServicePlan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'DOTNETCORE|8.0'
      webSocketsEnabled: true
      alwaysOn: true
      minTlsVersion: '1.2'
      ftpsState: 'Disabled'
      appSettings: [
        { name: 'ASPNETCORE_ENVIRONMENT', value: 'Production' }
        { name: 'App__BaseUrl', value: 'https://app-${appName}.azurewebsites.net' }
        { name: 'Jwt__Secret', value: jwtSecret }
        { name: 'ConnectionStrings__DefaultConnection', value: 'Host=${postgresServer.properties.fullyQualifiedDomainName};Database=landgrab;Username=${postgresAdminUser};Password=${postgresAdminPassword};SslMode=Require' }
      ]
    }
  }
}

// ── PostgreSQL Flexible Server ──
resource postgresServer 'Microsoft.DBforPostgreSQL/flexibleServers@2023-12-01-preview' = {
  name: 'psql-${appName}'
  location: location
  sku: {
    name: 'Standard_B1ms'
    tier: 'Burstable'
  }
  properties: {
    version: '16'
    administratorLogin: postgresAdminUser
    administratorLoginPassword: postgresAdminPassword
    storage: {
      storageSizeGB: 32
    }
    backup: {
      backupRetentionDays: 7
      geoRedundantBackup: 'Disabled'
    }
    highAvailability: {
      mode: 'Disabled'
    }
  }
}

// ── PostgreSQL Database ──
resource postgresDb 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2023-12-01-preview' = {
  parent: postgresServer
  name: 'landgrab'
  properties: {
    charset: 'UTF8'
    collation: 'en_US.utf8'
  }
}

// ── Firewall: Allow Azure Services ──
resource postgresFirewall 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2023-12-01-preview' = {
  parent: postgresServer
  name: 'AllowAzureServices'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

// ── Outputs ──
output appServiceName string = appService.name
output appServiceDefaultHostname string = 'https://${appService.properties.defaultHostName}'
output postgresServerFqdn string = postgresServer.properties.fullyQualifiedDomainName
