using FluentAssertions;
using Landgrab.Api.Auth;

namespace Landgrab.Tests.Auth;

public sealed class PasswordServiceTests
{
    private readonly PasswordService _sut = new();

    [Fact]
    public void Hash_ValidPassword_ReturnsNonEmptyHash()
    {
        var hash = _sut.Hash("P@ssw0rd!");

        hash.Should().NotBeNullOrWhiteSpace();
    }

    [Fact]
    public void Hash_SamePasswordTwice_ReturnsDifferentHashes()
    {
        var firstHash = _sut.Hash("same-password");
        var secondHash = _sut.Hash("same-password");

        firstHash.Should().NotBe(secondHash);
    }

    [Fact]
    public void Verify_CorrectPassword_ReturnsTrue()
    {
        const string password = "CorrectHorseBatteryStaple!";
        var hash = _sut.Hash(password);

        var isValid = _sut.Verify(password, hash);

        isValid.Should().BeTrue();
    }

    [Fact]
    public void Verify_WrongPassword_ReturnsFalse()
    {
        var hash = _sut.Hash("correct-password");

        var isValid = _sut.Verify("wrong-password", hash);

        isValid.Should().BeFalse();
    }

    [Fact]
    public void Verify_EmptyPassword_ReturnsFalse()
    {
        var hash = _sut.Hash("correct-password");

        var isValid = _sut.Verify(string.Empty, hash);

        isValid.Should().BeFalse();
    }

    [Fact]
    public void Hash_UnicodePassword_ReturnsVerifiableHash()
    {
        const string password = "pässwörd🔐你好مرحبا";
        var hash = _sut.Hash(password);

        var isValid = _sut.Verify(password, hash);

        hash.Should().NotBeNullOrWhiteSpace();
        isValid.Should().BeTrue();
    }

    [Fact]
    public void Verify_InvalidHash_ThrowsSaltParseException()
    {
        Action act = () => _sut.Verify("password", "not-a-bcrypt-hash");

        act.Should().Throw<BCrypt.Net.SaltParseException>();
    }
}
