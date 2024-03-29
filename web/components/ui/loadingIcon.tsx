import { cn } from "@/lib/utils";
import Image from "next/image";
const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAACXBIWXMAAAsTAAALEwEAmpwYAAAGBUlEQVR4nO2az28TRxTHl1KoEBJUHKA9tCcUhNSqCfSeziZRqRqOvjQJ3klUi9IimniHFPWQfwAqcQzemYhws9RDSzABzziHVqUHK1xSAjTxDIiIJGQnpvKhuIStptjRZLN2nMRLQeIrvcvuePZ93rx982NtGCEpk8m0UEoflQwYr5oYYxnGmKeMUsqMl0XJZHJ7Le0opVkNIFvPvjcsxlgXY6zAGJsZGxtrrBeA4zhNhJAZjHEBY9xphCXG2HTZKcbYeDKZ3LpZgGQyuRVjfJMQ4inDGN8NE+CqBqDsy80CYIxjZedLAFdCA0in002MsacawNzY2NjbGwW4dOnSLozxQw1gyXGcj40wxRhL+Ebh7EYBCCE/6NEnhAwaYevatWt7GWN5zbkiY+zAegESicR+jPETLXUeDw0NvWO8CDHGbH0UKKUj6wUghKR80e8zXpRUvaaU3vZBfFYrACGkzef8n+fPn39r044JIbo451NCiCuc86ZqbdPpdLsPYDKbzW7TAG5o938rXx8YGHgTYzyhAziO83kN80QKYzxVcZ5QD+ecF4QQnjLO+RLn/MLU1NTeWstqOp2Olu9lMpkTlNJnjLElSunx8nWM8TFf2bxaqf/h4eG9GOMLqjpp7QsqCKsae563hXM+UwbQLM85j09MTKya5q9fv36w9BKXAVbk8ejo6HvK9GuEkG80gGIikTgYlKIY4zghJO9LNQXwQPkaSMw5bxRCjAdAKLsjhGj3/4ZS2kMpFZTSH1Op1K5K0dSiuhNjPEwIuU0IWR6xsjDG7RjjO37HSzaOMf6o6gM8z3vj3r17x4QQs0EgnHN6//79D4w66+LFiw2EkJEgxzHGC4SQU9WWLqs0PT29WwhxVgjxJACkKISouIxYrxzHsVQ6BTiu5omzg4ODuzfc+fT0dAPn/HLASDyoFwAh5FZA5EfUqNTrGUYul/tUCHFLA/i5Xn1jjLEW9cmhoaEjRhhSpTaXy0WFEIhzHriI24iSyeQOx3GOO47TMTg4uDyXvNYrISFEixAiwznPrmVCiN85571h+YIQ6kAI/YoQyq5ltm1n4vG4qSavRxUmroqWy+VWLZ83q97e3j0IoSJCyFuHzakRmH+lATjngHPO1pFC3xohybbtL2zb/qWWFEIIsXg8/klYvrxWKPI8b9vCwkK3lPL7fD6/p1799vb27kAIHbdtuzMWi4Uzkbmue0RKOSml9EpWt/Mb27ax9mJO2rZdv6XE/Px8g5RyRHP8P3Ndd65ez0AI/RFQYUYQQhuvdlLK3VLKc67rFgOc/0dKeaJeAKdPn45WKKHq2rn+/v7al9NqQyOlPCalnPU7XnKeSik/NOqsvr6+hlLUg+q9ixA6FYlEqm9oFhcXG13XHa/g+F0p5VH/bwAAXwEAZk3T/Km5uXnNFWpnZ+dOCOGwZVm3IYTQfx8h1G7b9t0KIOP9/f3BW0q1UZZSzgQ4/9h1XdvzvFWb+tbW1oOmaRZN0/SUAQC+0+93dXW9r0y/ZlnWCQihp8yyrGJPT8+qTf3AwMB2+7nyARBqI7UlsERKKQtaxJeklInZ2dl9laIJALhadr4EsBxRCOHXEMJnyrq7u5ePVaLRaFcZAD630Ur9nzlzZp9t2wnbtpc0gELFVJJSdpVSJbW4uHjIqCLTNI/qzpumOXn48OHlGg4hvKFFesXBFoRwwgfRXu1ZCKFDCKGUSi01VxibVSQS2Q4AuOMDWHG0CCHMag6uOFqEELb6AKZOnjy5+aPFWgUAsH2pc9nfphqAkmVZIzqEZVn2C3G+ra1tLwAgrwEUAQAH1gvQ09Oz37KsvzWAv2Kx2LuhAwAAEr7oB37gWAug1OacL5USoTrf0tLSBAB4qjk/V6n21wLQ0dGxC0L4UBuFpe7u7vA+MQEAUr7oxyq1rQVACUIY870LKSMsmaY5pQHcrDa11woQiUS2QghvagB/hgnQCQAoAAAeNDc3V/3QXSuAUjQabbQsawZCWIAQhvehW2nNBdUGAMoK/HDxf8myrIwG8PL82cOoUZZlmZZlzUMI56LRaGinB/8CYnJD6VvUAsAAAAAASUVORK5CYII=';

export default function LoadingIcon({
    className,
}: {
    className?: string;
}) {
    return (
        <Image src={image} alt='Loading spinner' height={0} width={0} className={cn("animate-spin h-5 w-5", className)}/>
    );
}
