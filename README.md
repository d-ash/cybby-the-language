# Cybby the Language

This is a quick prototype of a toy language interpreter. It consists of a parser and an execution machine.  
There are no tests, and the execution machine has only a small subset of functions (arithmetics and output).

## Language Syntax

This language is from a Lisp-family, it's based on S-expressions.  
A distinct feature is that, unlike in Lisp, you can also use __whitespace indentation__, similarly to how it's used in Python.

The following two statements are identical:

```
(funcFoo (funcBar (+ 1 2))
```
```
funcFoo
  funcBar
    + 1 2
```

You can combine these styles together, so that the code looks more readable (less parenthesis).

```
define twice а
  return (* a 2)

repeat (twice (twice 10))
  turnLeft 10
  move
  turnRight 5
```

Compare the above code with a Lisp-ish one:

```
(define twice (а)
  (* a 2))

(repeat (twice (twice 10))
  (begin
    (turnLeft 10)
    (move)
    (turnRight 5)))
```

Square brackets are used to identify arrays (quoted lists). Comments are marked with semicolons.

```
let fooBar [ 1 'yes' 3 'for sure' ]     ; comments
```
