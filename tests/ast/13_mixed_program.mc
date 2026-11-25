int n = 3;
int i = 0;
float avg = 0.0;
bool done = false;

while (i < n) {
  if (i == 0) {
    print i;
  } else {
    avg = avg + i;
  }
  i = i + 1;
}

done = true;
print done;
;
