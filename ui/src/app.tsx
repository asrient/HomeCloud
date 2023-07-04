import { StrictMode, useState } from "react";

export default () => {
  const [data, setData] = useState<number>(10);

  return (
    <StrictMode>
      <h1>Welcome to Pine.</h1>
      <h2>Data from Lib</h2>
      <pre>Subtract: {10}</pre>
    </StrictMode>
  );
};
