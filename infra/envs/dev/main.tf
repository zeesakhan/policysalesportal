terraform {
  required_version = ">= 1.9.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Real state backend needs the project AWS account (PROGRESS.md "Blocked").
  # Until then: terraform init -backend=false (validation only).
  backend "s3" {
    bucket = "PLACEHOLDER_tf_state_bucket"
    key    = "policy-sales-portal/dev/terraform.tfstate"
    region = "me-central-1"
  }
}

provider "aws" {
  # UAE region only — data residency is a binding constraint (REG-007/051)
  region = "me-central-1"
}

module "network" {
  source      = "../../modules/network"
  environment = "dev"
}

module "database" {
  source      = "../../modules/database"
  environment = "dev"
}

module "app" {
  source      = "../../modules/app"
  environment = "dev"
}
