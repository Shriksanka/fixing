import { DataSource } from 'typeorm';
import { Direction } from '../entities/direction.entity';
import { Timeframe } from '../entities/timeframe.entity';
import { ConfirmationType } from '../entities/confirmation-type.entity';
import { AppDataSource } from '../data-source';

async function seed() {
  const dataSource: DataSource = await AppDataSource.initialize();

  const directionRepo = dataSource.getRepository(Direction);
  const timeframeRepo = dataSource.getRepository(Timeframe);
  const confirmationTypeRepo = dataSource.getRepository(ConfirmationType);

  const long = directionRepo.create({ name: 'long' });
  const short = directionRepo.create({ name: 'short' });
  await directionRepo.save([long, short]);

  const timeframes = ['1H', '2H', '4H', '1D'].map((name) =>
    timeframeRepo.create({ name }),
  );
  await timeframeRepo.save(timeframes);

  const confirmations = [
    // P3
    {
      name: 'Strong Long Entry',
      direction: long,
      antagonist_name: 'Strong Short Entry',
    },
    {
      name: 'Strong Short Entry',
      direction: short,
      antagonist_name: 'Strong Long Entry',
    },
    {
      name: 'SSL Cross Alert',
      direction: long,
      antagonist_name: 'SSL2 Cross Alert',
    },
    {
      name: 'SSL2 Cross Alert',
      direction: short,
      antagonist_name: 'SSL Cross Alert',
    },
    {
      name: 'Buy Continuation',
      direction: long,
      antagonist_name: 'Sell Continuation',
    },
    {
      name: 'Sell Continuation',
      direction: short,
      antagonist_name: 'Buy Continuation',
    },
    {
      name: 'Baseline Buy Entry',
      direction: long,
      antagonist_name: 'Baseline Sell Entry',
    },
    {
      name: 'Baseline Sell Entry',
      direction: short,
      antagonist_name: 'Baseline Buy Entry',
    },
    { name: 'Exit Buy', direction: long, antagonist_name: 'Exit Sell' },
    { name: 'Exit Sell', direction: short, antagonist_name: 'Exit Buy' },

    // Rebound
    {
      name: 'Rebound long alert',
      direction: long,
      antagonist_name: 'Rebound short alert',
    },
    {
      name: 'Rebound short alert',
      direction: short,
      antagonist_name: 'Rebound long alert',
    },
    {
      name: 'Rebound long confirmed',
      direction: long,
      antagonist_name: 'Rebound short confirmed',
    },
    {
      name: 'Rebound short confirmed',
      direction: short,
      antagonist_name: 'Rebound long confirmed',
    },

    // Smart Vol
    {
      name: 'Smart Vol Long MA Cross',
      direction: long,
      antagonist_name: 'Smart Vol Short MA Cross',
    },
    {
      name: 'Smart Vol Short MA Cross',
      direction: short,
      antagonist_name: 'Smart Vol Long MA Cross',
    },
  ].map((data) => confirmationTypeRepo.create(data));

  await confirmationTypeRepo.save(confirmations);

  console.log('✅ Seed complete!');
  await dataSource.destroy();
}

seed().catch((e) => {
  console.error('❌ Seed failed:', e);
});
