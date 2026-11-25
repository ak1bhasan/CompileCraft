int i = 0;
while (i < 5) {
    int loop_scoped = 100;
    i = i + 1;
}
print loop_scoped;
