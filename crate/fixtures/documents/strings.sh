#!/usr/bin/env bash
# A comment mentioning "the docs" is prose, not a literal.

cat <<EOF
The heredoc body.
Second line.
EOF

cat <<'RAW'
No $expansion here.
RAW

cat <<-INDENTED
	tab indented body
	INDENTED

echo "double quoted"
echo 'single quoted'
file=report#1
echo "$file"
