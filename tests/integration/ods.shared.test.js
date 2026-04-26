const ODSContent = require('../../assets/js/ods.shared.js');

describe('KCODSContent', () => {
  test('getGoal retorna configuracao editorial completa para ODS 12', () => {
    const goal = ODSContent.getGoal('12');

    expect(goal).toBeTruthy();
    expect(goal.title).toBe('Consumo e Produção Responsáveis');
    expect(goal.modules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'compra-venda' }),
        expect.objectContaining({ key: 'achados-perdidos' })
      ])
    );
    expect(goal.sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ url: expect.stringContaining('sdgs.un.org/goals/goal12') }),
        expect.objectContaining({ url: expect.stringContaining('odsbrasil.gov.br/objetivo/objetivo?n=12') })
      ])
    );
  });
});
