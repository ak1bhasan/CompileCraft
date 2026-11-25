int global_x = 100;
{
    int local_y = 50;
    int global_x = 200;
    local_y = global_x + 10;
    {
        int deep_z = local_y * 2;
        deep_z = deep_z + global_x;
    }
}
int final_check = global_x;
