namespace Pgl.Core.Assistant;

/// <summary>One message of a chat history (role "user" or "model") – shared by the free AIs and the router.</summary>
public sealed record ChatTurn(string Role, string Text);
