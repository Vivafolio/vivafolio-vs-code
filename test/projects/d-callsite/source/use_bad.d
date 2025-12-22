module use_bad;

import bad_provider;

void main() {
    string wrong = "oops";
    auto result = needsInt(wrong); // type mismatch: string vs int
    (void) result;
}
