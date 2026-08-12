"""Module docstring.

Two lines, one string.
"""

# A comment mentioning "the docs" is prose, not a literal.


def greet(name):
    '''Greet a user politely.'''
    template = f"Hello, {name}!"
    pattern = r"\d+ items"
    payload = b"bytes"
    both = rb'raw bytes'
    inline = 'single quoted'
    hashed = "a # inside a string"
    empty = ''
    return template, pattern, payload, both, inline, hashed, empty
