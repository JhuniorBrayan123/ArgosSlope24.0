using System;
class Program {
    static void Main() {
        bool match = BCrypt.Net.BCrypt.Verify("Jhunior123.", "$2a$11$zvcEOYCsU5R.DrtZNVEcNOdVsOQwxl/V258c2ZPZ1Zz7tmmBvbjxa");
        Console.WriteLine("Match: " + match);
        Console.WriteLine("New hash: " + BCrypt.Net.BCrypt.HashPassword("Jhunior123."));
    }
}
