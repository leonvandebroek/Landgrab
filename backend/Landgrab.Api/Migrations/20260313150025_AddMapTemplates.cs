using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Landgrab.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddMapTemplates : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "MapTemplates",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Name = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    Description = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    CreatorUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    HexCoordinatesJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    HexCount = table.Column<int>(type: "int", nullable: false),
                    TileSizeMeters = table.Column<int>(type: "int", nullable: false),
                    CenterLat = table.Column<double>(type: "float", nullable: true),
                    CenterLng = table.Column<double>(type: "float", nullable: true),
                    IsPublic = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MapTemplates", x => x.Id);
                    table.ForeignKey(
                        name: "FK_MapTemplates_Users_CreatorUserId",
                        column: x => x.CreatorUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_MapTemplates_CreatorUserId",
                table: "MapTemplates",
                column: "CreatorUserId");

            migrationBuilder.CreateIndex(
                name: "IX_MapTemplates_IsPublic",
                table: "MapTemplates",
                column: "IsPublic");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "MapTemplates");
        }
    }
}
