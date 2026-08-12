<?php
# A hash comment mentioning "the docs".
// A slash comment mentioning "the notes".
/* A block comment mentioning "the manual". */

$heredoc = <<<EOT
Dear reader,
Welcome.
EOT;

$nowdoc = <<<'RAW'
No $expansion here.
RAW;

$double = "double quoted";
$single = 'single quoted';
$empty = '';
