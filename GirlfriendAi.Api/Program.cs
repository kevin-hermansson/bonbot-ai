using System.Collections.Concurrent;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

var appPin = Environment.GetEnvironmentVariable("APP_PIN");

var frontendUrl =
    Environment.GetEnvironmentVariable("FRONTEND_URL")
    ?? "http://localhost:5173";

if (string.IsNullOrWhiteSpace(appPin))
{
    throw new InvalidOperationException("APP_PIN is missing.");
}

var validTokens = new ConcurrentDictionary<string, DateTime>();
var failedLoginAttempts = new ConcurrentQueue<DateTime>();

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlite("Data Source=girlfriend-ai.db"));

builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowFrontend", policy =>
    {
        policy
            .WithOrigins(frontendUrl)
            .AllowAnyHeader()
            .AllowAnyMethod();
    });
});

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.Migrate();
}

app.UseCors("AllowFrontend");

bool IsAuthorized(HttpRequest request)
{
    var authorization = request.Headers.Authorization.ToString();

    if (!authorization.StartsWith("Bearer "))
    {
        return false;
    }

    var token = authorization["Bearer ".Length..];

    if (!validTokens.TryGetValue(token, out var expiresAt))
    {
        return false;
    }

    if (expiresAt < DateTime.UtcNow)
    {
        validTokens.TryRemove(token, out _);
        return false;
    }

    return true;
}

app.MapPost("/login", (LoginRequest request) =>
{
    var oneHourAgo = DateTime.UtcNow.AddHours(-1);

    while (
        failedLoginAttempts.TryPeek(out var attemptTime) &&
        attemptTime < oneHourAgo
    )
    {
        failedLoginAttempts.TryDequeue(out _);
    }

    if (failedLoginAttempts.Count >= 5)
    {
        return Results.StatusCode(
            StatusCodes.Status429TooManyRequests
        );
    }

    if (request.Pin != appPin)
    {
        failedLoginAttempts.Enqueue(DateTime.UtcNow);

        return Results.Unauthorized();
    }

    var token = Guid.NewGuid().ToString("N");

    validTokens[token] = DateTime.UtcNow.AddHours(8);

    return Results.Ok(new LoginResponse(token));
});

app.MapPost("/logout", (HttpRequest request) =>
{
    var authorization = request.Headers.Authorization.ToString();

    if (authorization.StartsWith("Bearer "))
    {
        var token = authorization["Bearer ".Length..];

        validTokens.TryRemove(token, out _);
    }

    return Results.NoContent();
});

app.MapGet("/", () => "Bönbot API is running");

app.MapPost("/chat", async (
    ChatRequest request,
    AppDbContext db,
    HttpRequest httpRequest) =>
{
    if (!IsAuthorized(httpRequest))
    {
        return Results.Unauthorized();
    }

    var apiKey = Environment.GetEnvironmentVariable("OPENAI_API_KEY");

    if (string.IsNullOrWhiteSpace(apiKey))
    {
        return Results.Problem("OPENAI_API_KEY is missing.");

    }
    if (string.IsNullOrWhiteSpace(request.Message))
    {
        return Results.BadRequest("Meddelandet får inte vara tomt.");
    }

    if (request.Message.Length > 2000)
    {
        return Results.BadRequest("Meddelandet får vara max 2000 tecken.");
    }   

    var userMessage = new ChatMessage
    {
        Role = "user",
        Content = request.Message
    };

    db.ChatMessages.Add(userMessage);
    await db.SaveChangesAsync();

    var chatHistory = await db.ChatMessages
        .OrderByDescending(message => message.Id)
        .Take(20)
        .OrderBy(message => message.Id)
        .Select(message => new
        {
            role = message.Role,
            content = message.Content
        })
        .ToListAsync();

    using var client = new HttpClient();

    client.DefaultRequestHeaders.Authorization =
        new AuthenticationHeaderValue("Bearer", apiKey);

    var body = new
    {
        model = "gpt-5.6-luna",

        instructions =
            "Du är en varm, hjälpsam och kortfattad personlig AI-assistent. " +
            "Du vet att användaren heter Bönan. " +
            "Svara alltid på svenska.",

        input = chatHistory
    };

    var json = JsonSerializer.Serialize(body);

    var response = await client.PostAsync(
        "https://api.openai.com/v1/responses",
        new StringContent(
            json,
            Encoding.UTF8,
            "application/json"
        )
    );

    var responseText =
        await response.Content.ReadAsStringAsync();

    if (!response.IsSuccessStatusCode)
    {
        return Results.Problem(responseText);
    }

    using var document =
        JsonDocument.Parse(responseText);

    var messageOutput = document.RootElement
        .GetProperty("output")
        .EnumerateArray()
        .First(item =>
            item.GetProperty("type").GetString() == "message");

    var reply = messageOutput
        .GetProperty("content")[0]
        .GetProperty("text")
        .GetString();

    var assistantMessage = new ChatMessage
    {
        Role = "assistant",
        Content = reply ?? ""
    };

    db.ChatMessages.Add(assistantMessage);
    await db.SaveChangesAsync();

    return Results.Ok(
        new ChatResponse(reply ?? "")
    );
});

app.MapGet("/messages", async (
    AppDbContext db,
    HttpRequest httpRequest) =>
{
    if (!IsAuthorized(httpRequest))
    {
        return Results.Unauthorized();
    }

    var messages = await db.ChatMessages
        .OrderBy(message => message.Id)
        .ToListAsync();

    return Results.Ok(messages);
});

app.MapDelete("/messages", async (
    AppDbContext db,
    HttpRequest httpRequest) =>
{
    if (!IsAuthorized(httpRequest))
    {
        return Results.Unauthorized();
    }

    await db.ChatMessages.ExecuteDeleteAsync();

    return Results.NoContent();
});

app.Run();

record ChatRequest(string Message);
record ChatResponse(string Reply);
record LoginRequest(string Pin);
record LoginResponse(string Token);