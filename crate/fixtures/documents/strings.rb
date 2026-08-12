# A comment mentioning "the docs" is prose, not a literal.
=begin
A block comment mentioning "the manual".
=end

TEXT = <<~EOS
Dear reader,
Welcome.
EOS

RAW = <<-'PLAIN'
No #{interpolation} here.
  PLAIN

DOUBLE = "double quoted"
SINGLE = 'single quoted'
EMPTY = ''
queue = []
queue << item
