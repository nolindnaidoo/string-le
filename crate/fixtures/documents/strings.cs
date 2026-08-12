// A comment mentioning "the docs" is prose, not a literal.
class Messages
{
    const string Path = @"C:\Users\test";
    const string Quoted = @"He said ""hi"" loudly";
    const string Spanning = @"first
second";
    const string Plain = "say \"hi\"";
    const char Marker = '"';
    const string Empty = "";

    static string Greet(string name) => $"Hello, {name}!";
}
