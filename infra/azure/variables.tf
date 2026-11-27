variable "subscription_id" {
  type = string
}
variable "resource_group_name" {
  description = "Created beforehand by an Owner (docs/deployment-nas.md); Terraform only reads it."
  type        = string
  default     = "rg-landgrab-prod"
}
variable "key_vault_name" {
  type    = string
  default = "kv-landgrab-prod"
}
variable "deployment_principal_id" {
  description = "Object id of the pipeline's service principal (Azure-LandGrab-SC): seeds and reads the vault's secrets."
  type        = string
}
variable "operator_object_id" {
  description = "Entra object id of the operator who uploads the store signing keys with app-release/app-keys.sh."
  type        = string
  default     = "6bf235f7-9644-46d2-9a99-5bff68283a06"
}
