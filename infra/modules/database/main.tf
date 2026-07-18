# Database module skeleton — PostgreSQL (ARCHITECTURE §1) with RLS (TEN-001).
# Instance definitions land with M0-T2 (data model core). Backups must remain
# in-region (REG-007/051) with 10-year audit retention (ARCHITECTURE §2).

variable "environment" {
  description = "Environment name (dev | uat | prod)"
  type        = string
}

output "environment" {
  value = var.environment
}
