# A comment mentioning "the docs" is prose, not a literal.

=pod

A POD block mentioning "the manual".

=cut

my $heredoc = <<'END';
Dear reader,
Welcome.
END

my $double = "double quoted";
my $single = 'single quoted';
my $last = $#items;
my $empty = '';
