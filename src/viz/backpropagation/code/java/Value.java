import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.function.DoubleUnaryOperator;

/** A number that remembers how it was made, so gradients can flow back. */
public class Value {
    public double data;
    public double grad;
    private final Value[] inputs;
    /** Passes this value's grad on to its inputs. */
    private Runnable backward = () -> {};

    public Value(double data, Value... inputs) {
        this.data = data;
        this.inputs = inputs;
    }

    /** x to a whole power k, by repeated multiplication. */
    static double power(double x, int k) {
        double p = 1;
        for (int i = 0; i < k; i++) p *= x;
        return p;
    }

    public Value add(Value o) {
        Value out = new Value(data + o.data, this, o);
        out.backward = () -> {
            grad += out.grad;
            o.grad += out.grad;
        };
        return out;
    }

    public Value sub(Value o) {
        Value out = new Value(data - o.data, this, o);
        out.backward = () -> {
            grad += out.grad;
            o.grad += -out.grad;
        };
        return out;
    }

    public Value mul(Value o) {
        Value out = new Value(data * o.data, this, o);
        out.backward = () -> {
            grad += o.data * out.grad;
            o.grad += data * out.grad;
        };
        return out;
    }

    public Value div(Value o) {
        Value out = new Value(data / o.data, this, o);
        out.backward = () -> {
            grad += (1 / o.data) * out.grad;
            o.grad += (-data / (o.data * o.data)) * out.grad;
        };
        return out;
    }

    public Value neg() {
        Value out = new Value(-data, this);
        out.backward = () -> grad += -out.grad;
        return out;
    }

    public Value pow(int k) {
        Value out = new Value(power(data, k), this);
        out.backward = () -> grad += (k * power(data, k - 1)) * out.grad;
        return out;
    }

    /** A function of one value; local(out) is its derivative. */
    private Value unary(double result, DoubleUnaryOperator local) {
        Value out = new Value(result, this);
        out.backward = () -> grad += local.applyAsDouble(out.data) * out.grad;
        return out;
    }

    public Value tanh() {
        return unary(StrictMath.tanh(data), t -> 1 - t * t);
    }

    public Value relu() {
        return unary(data > 0 ? data : 0, r -> data > 0 ? 1 : 0);
    }

    public Value exp() {
        return unary(StrictMath.exp(data), e -> e);
    }

    public Value sigmoid() {
        return unary(1 / (1 + StrictMath.exp(-data)), s -> s * (1 - s));
    }

    /** Fill in d(this)/d(v) for every value v that this was made from. */
    public void backward() {
        List<Value> order = new ArrayList<>();
        build(this, new HashSet<>(), order);
        grad = 1;
        Collections.reverse(order);
        for (Value v : order) v.backward.run();
    }

    /** Depth-first: v goes in after everything it reads. */
    private static void build(Value v, Set<Value> seen, List<Value> order) {
        if (!seen.add(v)) return;
        for (Value u : v.inputs) build(u, seen, order);
        order.add(v);
    }
}
