package main

// A comment mentioning "the docs" is prose, not a literal.

const usage = `line one
line two`

func messages() []string {
	quoted := "double quoted"
	escaped := "say \"hi\""
	marker := '"'
	empty := ""
	_ = marker
	return []string{usage, quoted, escaped, empty}
}
