# AWS Cost Budget Alert
# Sends an email notification if the forecasted or actual AWS monthly spend exceeds the specified threshold.

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

resource "aws_budgets_budget" "monthly_cost" {
  count             = var.billing_email != "" ? 1 : 0
  name              = "${var.app_name}-monthly-budget"
  budget_type       = "COST"
  limit_amount      = var.budget_limit
  limit_unit        = "USD"
  time_period_start = "2026-01-01_00:00" # Arbitrary start date in the past/present
  time_unit         = "MONTHLY"

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.billing_email]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = [var.billing_email]
  }
}
