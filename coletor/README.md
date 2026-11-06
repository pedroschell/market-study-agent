# Coletor

Serviço de coleta das fontes públicas, com histórico.

## Por que existe

Hoje a coleta é uma foto tirada à mão. O valor real do dado de biblioteca de
anúncios está na **mudança ao longo do tempo** — "o concorrente foi de 3 para 14
anúncios em dois meses" — e isso não existe sem medição repetida e armazenada.

Duas coisas dependem disso:

1. O tier recorrente do produto (o gancho de mensalidade)
2. Disparo frio em volume — produzir isca para muitos prospects exige coleta barata

## Escopo

**Coleta e guarda. Não analisa.** O julgamento fica com o agente de análise — é o que se vende.

## Stack pretendida

Java + Spring Boot + Selenium.

Divisão de fronteira que importa: **Selenium dirige o navegador; o JavaScript
existente faz o parsing dentro da página.**

```java
JavascriptExecutor js = (JavascriptExecutor) driver;
Object resultado = js.executeScript(EXTRAIR_JS);
```

A extração precisa resolver
dedupe por ID da biblioteca e parsing da data de veiculação. Reaproveitar evita
reimplementar caminhada de DOM em Java — e quando a Meta mudar o layout, o conserto
são 44 linhas de JS, não código Java.

## Primeiro passo

Antes de Spring, banco ou agendamento: um `main()` que abre a Biblioteca de Anúncios,
rola a página, injeta o `extrair.js` e imprime no console.

É o único pedaço que pode não funcionar — scroll infinito em SPA pesada é onde
Selenium sofre. Melhor descobrir em 80 linhas do que depois de montar o serviço em
volta. Se não sobreviver, a alternativa é Playwright-Java.

## Decidido ficar de fora por enquanto

| Fora | Por quê |
|---|---|
| Postgres | H2/SQLite embarcado. Mesmo JPA, zero infraestrutura. |
| API REST | Um consumidor só, e ele lê arquivo. Entra quando houver dashboard. |
| Agendamento em nuvem | IP de datacenter toma bloqueio da Meta. Roda local. |

## Limites permanentes

Scraper é manutenção contínua, não build-once. E volume alto contra o Facebook pega
throttle: projete para semanal, poucos termos, poucos clientes.
