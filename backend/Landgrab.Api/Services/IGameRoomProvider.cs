using Landgrab.Api.Models;

namespace Landgrab.Api.Services;

public interface IGameRoomProvider
{
    GameRoom? GetRoom(string code);
    GameRoom? GetRoomByConnection(string connectionId);
    GameRoom? GetRoomByUserId(string userId, string? roomCode = null);
}
