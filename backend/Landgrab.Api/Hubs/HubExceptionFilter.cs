using Landgrab.Api.Models;
using Microsoft.AspNetCore.SignalR;

namespace Landgrab.Api.Hubs;

public sealed class HubExceptionFilter(ILogger<HubExceptionFilter> logger) : IHubFilter
{
    private const string GenericErrorCode = "GENERAL";
    private const string GenericErrorMessage = "An unexpected error occurred.";

    public async ValueTask<object?> InvokeMethodAsync(
        HubInvocationContext invocationContext,
        Func<HubInvocationContext, ValueTask<object?>> next)
    {
        try
        {
            return await next(invocationContext);
        }
        catch (HubException)
        {
            throw;
        }
        catch (Exception ex)
        {
            logger.LogError(ex,
                "Unhandled exception in hub method {Method} for connection {ConnectionId}",
                invocationContext.HubMethodName,
                invocationContext.Context.ConnectionId);

            await invocationContext.Hub.Clients.Caller.SendAsync("Error", new HubErrorDto
            {
                Code = GenericErrorCode,
                Message = GenericErrorMessage
            });

            return null;
        }
    }
}
