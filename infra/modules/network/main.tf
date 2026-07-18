# Network module skeleton — VPC/subnets/endpoints are defined when the first
# deployable service lands. Region is fixed by the calling env (REG-007/051).

variable "environment" {
  description = "Environment name (dev | uat | prod)"
  type        = string
}

output "environment" {
  value = var.environment
}
