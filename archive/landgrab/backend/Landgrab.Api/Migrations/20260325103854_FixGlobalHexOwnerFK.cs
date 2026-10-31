using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Landgrab.Api.Migrations
{
    /// <inheritdoc />
    public partial class FixGlobalHexOwnerFK : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_GlobalHexes_Alliances_OwnerAllianceId",
                table: "GlobalHexes");

            migrationBuilder.DropForeignKey(
                name: "FK_GlobalHexes_Users_OwnerId",
                table: "GlobalHexes");

            migrationBuilder.DropIndex(
                name: "IX_GlobalHexes_OwnerId",
                table: "GlobalHexes");

            migrationBuilder.DropColumn(
                name: "OwnerId",
                table: "GlobalHexes");

            migrationBuilder.AddForeignKey(
                name: "FK_GlobalHexes_Alliances_OwnerAllianceId",
                table: "GlobalHexes",
                column: "OwnerAllianceId",
                principalTable: "Alliances",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "FK_GlobalHexes_Users_OwnerUserId",
                table: "GlobalHexes",
                column: "OwnerUserId",
                principalTable: "Users",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_GlobalHexes_Alliances_OwnerAllianceId",
                table: "GlobalHexes");

            migrationBuilder.DropForeignKey(
                name: "FK_GlobalHexes_Users_OwnerUserId",
                table: "GlobalHexes");

            migrationBuilder.AddColumn<Guid>(
                name: "OwnerId",
                table: "GlobalHexes",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_GlobalHexes_OwnerId",
                table: "GlobalHexes",
                column: "OwnerId");

            migrationBuilder.AddForeignKey(
                name: "FK_GlobalHexes_Alliances_OwnerAllianceId",
                table: "GlobalHexes",
                column: "OwnerAllianceId",
                principalTable: "Alliances",
                principalColumn: "Id");

            migrationBuilder.AddForeignKey(
                name: "FK_GlobalHexes_Users_OwnerId",
                table: "GlobalHexes",
                column: "OwnerId",
                principalTable: "Users",
                principalColumn: "Id");
        }
    }
}
