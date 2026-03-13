namespace Landgrab.Api.Models;

public sealed class HubErrorDto
{
    public required string Code { get; init; }
    public required string Message { get; init; }
}
