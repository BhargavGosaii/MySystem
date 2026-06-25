variable "aws_region" {
  type        = string
  description = "AWS region to deploy resources"
  default     = "us-east-1"
}

variable "app_name" {
  type        = string
  description = "Application name"
}

variable "environment" {
  type        = string
  description = "Deployment environment"
  default     = "production"
}

variable "container_port" {
  type        = number
  description = "Port the application container listens on"
  default     = 3000
}

variable "instance_type" {
  type        = string
  description = "EC2 instance class (t3.micro is AWS Free Tier)"
  default     = "t3.micro"
}

variable "billing_email" {
  type        = string
  description = "Email address to send AWS budget and billing alerts"
  default     = ""
}

variable "budget_limit" {
  type        = string
  description = "Monthly budget limit in USD"
  default     = "20"
}

variable "enable_custom_domain" {
  type        = bool
  description = "Enable custom domain routing"
  default     = false
}

variable "domain_name" {
  type        = string
  description = "Custom domain name (e.g., app.example.com)"
  default     = ""
}

variable "dns_provider" {
  type        = string
  description = "DNS provider for validation ('route53' or 'external')"
  default     = "external"
}
