# Define a proc that, when used, will trigger a diagnostic in the user file.
# We create an intentionally problematic signature to cause a type error at call-site.

proc needsInt(x: int): int = x + 1



