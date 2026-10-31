@description('Base name for all resources')
param appName string = 'landgrab-prod'

@description('Azure region')
param location string = resourceGroup().location

@description('SQL Server admin username')
param sqlAdminUser string = 'sqladmin'

@secure()
@description('SQL Server admin password')
param sqlAdminPassword string

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
        { name: 'ConnectionStrings__DefaultConnection', value: 'Server=tcp:sql-${appName}.database.windows.net,1433;Initial Catalog=landgrab;User Id=${sqlAdminUser};Password=${sqlAdminPassword};Encrypt=True;TrustServerCertificate=False;Connection Timeout=30;' }
      ]
    }
  }
}

// ── Azure SQL Logical Server ──
resource sqlServer 'Microsoft.Sql/servers@2023-08-01-preview' = {
  name: 'sql-${appName}'
  location: location
  properties: {
    administratorLogin: sqlAdminUser
    administratorLoginPassword: sqlAdminPassword
    version: '12.0'
  }
}

// ── Azure SQL Database (Serverless) ──
resource sqlDatabase 'Microsoft.Sql/servers/databases@2023-08-01-preview' = {
  parent: sqlServer
  name: 'landgrab'
  location: location
  sku: {
    name: 'GP_S_Gen5_1'
    tier: 'GeneralPurpose'
  }
  properties: {
    autoPauseDelay: 60
    minCapacity: '0.5'
    collation: 'SQL_Latin1_General_CP1_CI_AS'
  }
}

// ── Azure SQL Database Short-Term Backup Retention ──
resource sqlDatabaseShortTermBackup 'Microsoft.Sql/servers/databases/backupShortTermRetentionPolicies@2023-08-01-preview' = {
  parent: sqlDatabase
  name: 'default'
  properties: {
    retentionDays: 7
    diffBackupIntervalInHours: 12
  }
}

// ── Firewall: Allow Azure Services ──
resource sqlFirewall 'Microsoft.Sql/servers/firewallRules@2023-08-01-preview' = {
  parent: sqlServer
  name: 'AllowAzureServices'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

// ── Outputs ──
output appServiceName string = appService.name
output appServiceDefaultHostname string = 'https://${appService.properties.defaultHostName}'
output sqlServerFqdn string = sqlServer.properties.fullyQualifiedDomainName
