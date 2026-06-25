# AWS ACM (SSL Certificate) and Custom Domain Routing for EC2
# Routes custom domains to the EC2 Elastic IP address

variable "enable_custom_domain" {
  type        = bool
  description = "Enable custom domain and SSL certificates"
  default     = false
}

variable "domain_name" {
  type        = string
  description = "Custom domain name (e.g. app.myproduct.com)"
  default     = ""
}

variable "dns_provider" {
  type        = string
  description = "DNS provider ('route53' or 'external')"
  default     = "external"
}

# 1. SSL/TLS Certificate via ACM
resource "aws_acm_certificate" "cert" {
  count             = var.enable_custom_domain ? 1 : 0
  domain_name       = var.domain_name
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = {
    Name = "${var.app_name}-cert"
  }
}

# --- Route 53 DNS Configuration (Automated Setup) ---
data "aws_route53_zone" "primary" {
  count        = var.enable_custom_domain && var.dns_provider == "route53" ? 1 : 0
  name         = join(".", slice(split(".", var.domain_name), length(split(".", var.domain_name)) - 2, length(split(".", var.domain_name))))
  private_zone = false
}

# DNS Validation record in Route53
resource "aws_route53_record" "cert_validation" {
  count   = var.enable_custom_domain && var.dns_provider == "route53" ? 1 : 0
  name    = tolist(aws_acm_certificate.cert[0].domain_validation_options)[0].resource_record_name
  type    = tolist(aws_acm_certificate.cert[0].domain_validation_options)[0].resource_record_type
  zone_id = data.aws_route53_zone.primary[0].zone_id
  records = [tolist(aws_acm_certificate.cert[0].domain_validation_options)[0].resource_record_value]
  ttl     = 60
}

# Validate Certificate in ACM
resource "aws_acm_certificate_validation" "cert" {
  count                   = var.enable_custom_domain && var.dns_provider == "route53" ? 1 : 0
  certificate_arn         = aws_acm_certificate.cert[0].arn
  validation_record_fqdns = [aws_route53_record.cert_validation[0].fqdn]
}

# Create DNS A Record pointing to the EC2 Elastic IP
resource "aws_route53_record" "app" {
  count   = var.enable_custom_domain && var.dns_provider == "route53" ? 1 : 0
  zone_id = data.aws_route53_zone.primary[0].zone_id
  name    = var.domain_name
  type    = "A"
  ttl     = 300
  records = [aws_eip.app.public_ip]
}

# --- Outputs for External DNS (GoDaddy, Cloudflare, etc.) ---
output "dns_validation_name" {
  value       = var.enable_custom_domain ? tolist(aws_acm_certificate.cert[0].domain_validation_options)[0].resource_record_name : "None"
  description = "CNAME Name to add to your DNS provider for SSL certificate validation"
}

output "dns_validation_value" {
  value       = var.enable_custom_domain ? tolist(aws_acm_certificate.cert[0].domain_validation_options)[0].resource_record_value : "None"
  description = "CNAME Value/Alias to add to your DNS provider for SSL certificate validation"
}

output "app_dns_a_record_ip" {
  value       = aws_eip.app.public_ip
  description = "Point your domain A Record (IP Address) to this public Elastic IP in your DNS provider"
}
