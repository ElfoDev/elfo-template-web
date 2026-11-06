import { describe, expect, it } from "vitest";
import { DetailedError, getErrorMessage } from "./api";

describe("getErrorMessage", () => {
  it("usa a mensagem de erro enviada pela API", () => {
    const error = new DetailedError("500 Internal Server Error", {
      statusCode: 500,
      detail: { data: { error: "Banco indisponível" } },
    });
    expect(getErrorMessage(error)).toBe("Banco indisponível");
  });

  it("cai para o status HTTP quando a API não manda mensagem", () => {
    const error = new DetailedError("502", { statusCode: 502, detail: { data: "<html>" } });
    expect(getErrorMessage(error)).toBe("A API respondeu com erro 502.");
  });

  it("trata falha de rede", () => {
    expect(getErrorMessage(new TypeError("Failed to fetch"))).toBe(
      "Não foi possível conectar à API.",
    );
  });

  it("tem um fallback genérico", () => {
    expect(getErrorMessage("??")).toBe("Algo deu errado.");
  });
});
