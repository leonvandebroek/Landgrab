namespace Landgrab.Api.Auth;

/// <summary>
/// Sends transactional emails via Azure Communication Services Email.
/// To enable, set AzureCommunicationServices:ConnectionString and
/// AzureCommunicationServices:SenderAddress in config.
/// When those are absent the service logs instead of sending (dev mode).
/// </summary>
public class EmailService(IConfiguration config, ILogger<EmailService> logger)
{
    private readonly string? _connectionString = config["AzureCommunicationServices:ConnectionString"];
    private readonly string _sender = config["AzureCommunicationServices:SenderAddress"] ?? "noreply@landgrab.app";
    private readonly string _appUrl = config["App:BaseUrl"] ?? "http://localhost:5173";

    public async Task SendPasswordResetAsync(string toEmail, string resetToken)
    {
        var resetUrl = $"{_appUrl}/reset-password?token={Uri.EscapeDataString(resetToken)}";
        var subject = "Reset your Landgrab password";
        var body = $"""
            <h2>Password Reset</h2>
            <p>Click the link below to reset your Landgrab password. This link expires in 1 hour.</p>
            <p><a href="{resetUrl}">{resetUrl}</a></p>
            <p>If you didn't request this, you can safely ignore this email.</p>
            """;

        await SendEmailAsync(toEmail, subject, body);
    }

    public async Task SendWelcomeAsync(string toEmail, string username)
    {
        var subject = "Welcome to Landgrab!";
        var body = $"""
            <h2>Welcome to Landgrab, {username}!</h2>
            <p>Your neighborhood conquest adventure begins now.</p>
            <p><a href="{_appUrl}">Start playing →</a></p>
            """;

        await SendEmailAsync(toEmail, subject, body);
    }

    private async Task SendEmailAsync(string to, string subject, string htmlBody)
    {
        if (string.IsNullOrEmpty(_connectionString))
        {
            logger.LogInformation("[DEV] Email to {To} | Subject: {Subject}\n{Body}", to, subject, htmlBody);
            return;
        }

        // Production: use Azure Communication Services Email SDK
        // Install: Azure.Communication.Email
        // var client = new EmailClient(_connectionString);
        // var message = new EmailMessage(
        //     senderAddress: _sender,
        //     content: new EmailContent(subject) { Html = htmlBody },
        //     recipients: new EmailRecipients([new EmailAddress(to)]));
        // await client.SendAsync(WaitUntil.Completed, message);

        // Placeholder until ACS SDK is added:
        logger.LogInformation("Would send email to {To}: {Subject}", to, subject);
        await Task.CompletedTask;
    }
}
