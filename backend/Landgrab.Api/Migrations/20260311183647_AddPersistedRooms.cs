using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Landgrab.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddPersistedRooms : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "PersistedRooms",
                columns: table => new
                {
                    Code = table.Column<string>(type: "character varying(6)", maxLength: 6, nullable: false),
                    HostUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    StateJson = table.Column<string>(type: "jsonb", nullable: false),
                    Phase = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PersistedRooms", x => x.Code);
                });

            migrationBuilder.CreateIndex(
                name: "IX_PersistedRooms_IsActive",
                table: "PersistedRooms",
                column: "IsActive");

            migrationBuilder.CreateIndex(
                name: "IX_PersistedRooms_UpdatedAt",
                table: "PersistedRooms",
                column: "UpdatedAt");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "PersistedRooms");
        }
    }
}
