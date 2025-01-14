import { Inject, Injectable, NotFoundException, OnModuleInit, HttpException, HttpStatus } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Query, QueryOptions, Schema } from 'mongoose';
import { Transaction, TransactionDocument } from './transaction.schema';
import { CreateTransactionDto } from './dtos/create-transaction.dto';
import { UpdateTransactionDto } from './dtos/update-transaction.dto';
import { plainToClass } from 'class-transformer';
import { ClientKafka, EventPattern } from '@nestjs/microservices';
import { TransactionDto } from './dtos/transaction.dto';
import { ANTI_FRAUD_SERVICE_NAME } from 'src/app.constants';
import { Events } from './types/transaction-types-enums';

@Injectable()
export class TransactionsService {
    constructor(
        @InjectModel(Transaction.name) private readonly transactionModel: Model<TransactionDocument>,
        @Inject(ANTI_FRAUD_SERVICE_NAME) private readonly antifraudClient: ClientKafka) {
    }


    /**
     * 
     * @param createDto Transacción Atómica
     * @returns 
     */
    async create(createDto: CreateTransactionDto) {
        console.log('Step 1::: Transaction creation attempt');
        const session = await this.transactionModel.startSession()
        session.startTransaction();

        try {
            const transaction = new this.transactionModel(createDto);
            await transaction.save({ session })
            await session.commitTransaction();

            const parsedTransaction = plainToClass(TransactionDto, transaction.toJSON());

            console.log('1:: MESSAGE SENT TO ANTIFRAUD CLIENT MICROSERVICE');
            this.antifraudClient.emit(Events.ON_TRANSACTION_CREATE, JSON.stringify(parsedTransaction));

            return parsedTransaction;

        } catch (ex: any) {
            await session.abortTransaction();
            throw new HttpException(ex, HttpStatus.UNPROCESSABLE_ENTITY, { cause: new Error('Transaction aborted') });
        } finally {

            session.endSession()
        }
    }

    async findAll(
        query: FilterQuery<Transaction> = {},
        options: QueryOptions<Transaction> = {}
    ) {
        const transactions = await this.transactionModel.find(query, null, options).exec();
        return transactions.map(transaction => plainToClass(TransactionDto, transaction.toJSON()));
    }


    async update(id: string, updateDto: UpdateTransactionDto) {
        const transaction = await this.transactionModel.findByIdAndUpdate(id, updateDto, { returnOriginal: false }).exec();
        if (!transaction) {
            throw new NotFoundException(`Entity with id ${id} not found`);
        }
        console.log('5:: NEW STATUS UPDATED');
        console.log(':::DONE:::');
        return transaction;
    }

}