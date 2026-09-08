public class ChatMessage
{
    public int Id { get; set; }

    public string Role { get; set; } = "";

    public string Content { get; set; } = "";

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}