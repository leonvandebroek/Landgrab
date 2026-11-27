# Landgrab's only Azure resource: one Key Vault (pennies a month). The app itself runs on the NAS, never in Azure.
data "azurerm_client_config" "current" {}

data "azurerm_resource_group" "landgrab" {
  name = var.resource_group_name
}

locals {
  tags = { application = "landgrab", managed_by = "terraform" }
}

resource "azurerm_key_vault" "landgrab" {
  name                       = var.key_vault_name
  resource_group_name        = data.azurerm_resource_group.landgrab.name
  location                   = data.azurerm_resource_group.landgrab.location
  tenant_id                  = data.azurerm_client_config.current.tenant_id
  sku_name                   = "standard"
  rbac_authorization_enabled = true
  soft_delete_retention_days = 90
  purge_protection_enabled   = true
  tags                       = local.tags
  lifecycle { prevent_destroy = true }
}

# The pipeline seeds the runtime secrets and reads them at deploy time; the operator uploads the signing keys.
resource "azurerm_role_assignment" "secrets_officer" {
  for_each             = { pipeline = var.deployment_principal_id, operator = var.operator_object_id }
  scope                = azurerm_key_vault.landgrab.id
  role_definition_name = "Key Vault Secrets Officer"
  principal_id         = each.value
}
