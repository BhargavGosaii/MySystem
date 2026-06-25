# AWS ACM (SSL Certificate) and Custom Domain Routing
# Supports automated Route 53 setups or external DNS providers (GoDaddy, Cloudflare, Namecheap)

variable "enable_custom_domain" {
  type        = bool
  description = "Enable custom domain and HTTPS SSL certificate"
  default     = false
}

variable "domain_name" {
  type        = string
  description = "The custom domain name (e.g., app.example.com)"
  default     = ""
}

variable "dns_provider" {
  type        = string
  description = "DNS provider for domain validation ('route53' or 'external')"
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

# Create DNS validation record in Route53
resource "aws_route53_record" "cert_validation" {
  count   = var.enable_custom_domain && var.dns_provider == "route53" ? 1 : 0
  name    = tolist(aws_acm_certificate.cert[0].domain_validation_options)[0].resource_record_name
  type    = tolist(aws_acm_certificate.cert[0].domain_validation_options)[0].resource_record_type
  zone_id = data.aws_route53_zone.primary[0].zone_id
  records = [tolist(aws_acm_certificate.cert[0].domain_validation_options)[0].resource_record_value]
  ttl     = 60
}

# Validate certificate in ACM (Wait for validation to complete)
resource "aws_acm_certificate_validation" "cert" {
  count                   = var.enable_custom_domain && var.dns_provider == "route53" ? 1 : 0
  certificate_arn         = aws_acm_certificate.cert[0].arn
  validation_record_fqdns = [aws_route53_record.cert_validation[0].fqdn]
}

# Create A record in Route53 pointing to the Load Balancer
resource "aws_route53_record" "app" {
  count   = var.enable_custom_domain && var.dns_provider == "route53" ? 1 : 0
  zone_id = data.aws_route53_zone.primary[0].zone_id
  name    = var.domain_name
  type    = "A"

  alias {
    name                   = aws_lb.main.dns_name
    zone_id                = aws_lb.main.zone_id
    evaluate_target_health = true
  }
}

# --- Outputs for External DNS Setup (GoDaddy, Cloudflare, etc.) ---
output "dns_validation_name" {
  value       = var.enable_custom_domain ? tolist(aws_acm_certificate.cert[0].domain_validation_options)[0].resource_record_name : "None"
  description = "CNAME Name to add to your DNS provider for SSL certificate validation"
}

output "dns_validation_value" {
  value       = var.enable_custom_domain ? tolist(aws_acm_certificate.cert[0].domain_validation_options)[0].resource_record_value : "None"
  description = "CNAME Value/Alias to add to your DNS provider for SSL certificate validation"
}

output "app_cname_alias" {
  value       = aws_lb.main.dns_name
  description = "Point your domain CNAME record to this target to route traffic to the app"
}
