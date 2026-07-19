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
    key    = "policy-sales-portal/uat/terraform.tfstate"
    region = "me-central-1"
  }
}

provider "aws" {
  # UAE region only — data residency is a binding constraint (REG-007/051)
  region = "me-central-1"
}

# UAT is seeded with the UAT data pack and runs mocks in deterministic mode
# (ARCHITECTURE §4); seeding is code and lands with M4-T1.
module "network" {
  source      = "../../modules/network"
  environment = "uat"
}

module "database" {
  source      = "../../modules/database"
  environment = "uat"
}

module "app" {
  source      = "../../modules/app"
  environment = "uat"
}
