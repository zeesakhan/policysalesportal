# App module skeleton — API + web runtime. Definitions land when the first
# deployable build exists; prod adds the PLACEHOLDER_ startup guard env wiring
# (CLAUDE.md §2).

variable "environment" {
  description = "Environment name (dev | uat | prod)"
  type        = string
}

output "environment" {
  value = var.environment
}
