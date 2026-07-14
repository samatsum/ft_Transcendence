#ifndef UTILS_H
# define UTILS_H

# include <stdlib.h>
# include <stdint.h>
# include <sys/time.h>
# include <stdio.h>

/* ************************************************************************** */
#define PROFILE_START(name) \
    struct timeval start_##name, end_##name; \
    gettimeofday(&start_##name, NULL);

#define PROFILE_END(name) \
    gettimeofday(&end_##name, NULL); \
    double time_taken_##name = (end_##name.tv_sec - start_##name.tv_sec) * 1e6; \
    time_taken_##name = (time_taken_##name + (end_##name.tv_usec - start_##name.tv_usec)) * 1e-3; \
    printf("Time taken by %s: %f ms\n", #name, time_taken_##name);

/* ************************************************************************** */
# define PTR_CAST(a)	(void*)((uintptr_t)(a))
# define MAX(a, b)		((a) > (b) ? (a) : (b))

/* ************************************************************************** */
typedef struct s_pos
{
	double	x;
	double	y;
}				t_pos;

typedef struct s_str
{
	char*			content;
	struct s_str*	next;
}				t_str;

/* ************************************************************************** */
int
	ft_strlen(const char* str);
int
	ft_in_set(char c, const char* set);
char*
	ft_substr(const char* s, int start, int len);
char*
	ft_strdup(const char* s1);
int
	ft_atoi(const char* str);
unsigned int
	ft_rand(unsigned int* seed);
t_str*
	ft_split(const char* org, char sep);
int
	str_length(t_str* str);
t_str*
	str_add_back(t_str** str, char* content);
t_str*
	str_last(t_str* str);
int
	str_clear(t_str** list);
void
	set_pos(t_pos* pos, double x, double y);
void
	copy_pos(t_pos* pos, t_pos* org);
double
	dist_pos(t_pos* a, t_pos* b);
int
	ft_strcmp(const char* s1, const char* s2);
int
	ft_write_int(char* buf, int val, int start);
int
	ft_write_str(char* buf, char* str, int start);
int
	ft_write_int_n(char* buf, int size, int val, int start);
int
	ft_write_str_n(char* buf, int size, char* str, int start);
int
	ft_endswith(const char* str, const char* end);

#endif
